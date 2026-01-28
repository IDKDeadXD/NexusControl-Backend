import Docker from 'dockerode';
import path from 'path';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { Bot, BotRuntime } from '@prisma/client';
import { Readable } from 'stream';

// Configure Docker connection based on platform
const isWindows = process.platform === 'win32';
const dockerOptions: Docker.DockerOptions = isWindows
  ? { socketPath: '//./pipe/docker_engine' }
  : { socketPath: config.DOCKER_SOCKET };

const docker = new Docker(dockerOptions);

// Convert Windows paths to Docker-compatible format
// Docker on Windows needs paths like /c/Users/... instead of C:\Users\...
function convertToDockerPath(windowsPath: string): string {
  if (!isWindows) return windowsPath;

  // Resolve to absolute path
  const absolutePath = path.resolve(windowsPath);

  // Convert C:\path\to\dir to /c/path/to/dir
  const converted = absolutePath
    .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
    .replace(/\\/g, '/');

  return converted;
}

const RUNTIME_IMAGES: Record<BotRuntime, string> = {
  NODEJS: 'node:20-alpine',
  PYTHON: 'python:3.11-alpine',
};

// Daemon prefix for system messages
const DAEMON_PREFIX = '[Dead Studios Daemon]:';

// Startup scripts that install dependencies then run the bot
const RUNTIME_STARTUP_SCRIPTS: Record<BotRuntime, (entryFile: string) => string> = {
  NODEJS: (entryFile) =>
    `cd /bot && if [ -f package.json ]; then echo "${DAEMON_PREFIX} Installing Node.js dependencies..." && npm install --production 2>&1 && echo "${DAEMON_PREFIX} Dependencies installed successfully"; fi && echo "${DAEMON_PREFIX} Starting bot..." && node ${entryFile}`,
  PYTHON: (entryFile) =>
    `cd /bot && if [ -f requirements.txt ]; then echo "${DAEMON_PREFIX} Installing Python dependencies..." && pip install --no-cache-dir -r requirements.txt 2>&1 && echo "${DAEMON_PREFIX} Dependencies installed successfully"; fi && echo "${DAEMON_PREFIX} Starting bot..." && python ${entryFile}`,
};

function getStartCommand(bot: Bot): string[] {
  // If custom start command is provided, wrap it with dependency installation
  if (bot.startCommand) {
    const installCmd =
      bot.runtime === 'NODEJS'
        ? 'if [ -f package.json ]; then npm install --production 2>&1; fi'
        : 'if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt 2>&1; fi';
    return ['sh', '-c', `cd /bot && ${installCmd} && ${bot.startCommand}`];
  }
  // Otherwise use default runtime startup script (includes dependency installation)
  return ['sh', '-c', RUNTIME_STARTUP_SCRIPTS[bot.runtime](bot.entryFile)];
}

export interface ContainerStats {
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
}

export async function createContainer(
  bot: Bot,
  envVars: { key: string; value: string }[]
): Promise<string> {
  const image = RUNTIME_IMAGES[bot.runtime];
  const cmd = getStartCommand(bot);

  // Prepare environment variables
  const env = envVars.map((e) => `${e.key}=${e.value}`);

  // Calculate resource limits from bot configuration
  const memoryBytes = bot.memoryLimit * 1024 * 1024; // Convert MB to bytes
  const memorySwapBytes = bot.memoryLimit * 2 * 1024 * 1024; // Double for swap
  const nanoCpus = Math.floor(bot.cpuLimit * 1e9); // Convert CPU cores to nanocpus

  try {
    // Pull image if not exists
    await pullImageIfNeeded(image);

    const container = await docker.createContainer({
      Image: image,
      name: bot.containerName,
      Cmd: cmd,
      WorkingDir: '/bot',
      Env: env,
      Labels: {
        'botmanager.bot.id': bot.id,
        'botmanager.bot.name': bot.name,
        'botmanager.managed': 'true',
      },
      HostConfig: {
        Binds: [`${convertToDockerPath(bot.codeDirectory)}:/bot:rw`],
        Memory: memoryBytes,
        MemorySwap: memorySwapBytes,
        NanoCpus: nanoCpus,
        RestartPolicy: bot.autoRestart
          ? { Name: 'unless-stopped', MaximumRetryCount: 0 }
          : { Name: 'no', MaximumRetryCount: 0 },
        NetworkMode: 'bridge',
      },
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
    });

    logger.info({ botId: bot.id, containerId: container.id, memoryLimit: bot.memoryLimit, cpuLimit: bot.cpuLimit }, 'Container created');
    return container.id;
  } catch (error) {
    logger.error({ error, botId: bot.id }, 'Failed to create container');
    throw error;
  }
}

export async function startContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.start();
    logger.info({ containerId }, 'Container started');
  } catch (error) {
    logger.error({ error, containerId }, 'Failed to start container');
    throw error;
  }
}

export async function stopContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 10 }); // 10 second timeout
    logger.info({ containerId }, 'Container stopped');
  } catch (error: any) {
    if (error.statusCode === 304) {
      // Container already stopped
      return;
    }
    logger.error({ error, containerId }, 'Failed to stop container');
    throw error;
  }
}

export async function restartContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.restart({ t: 10 });
    logger.info({ containerId }, 'Container restarted');
  } catch (error) {
    logger.error({ error, containerId }, 'Failed to restart container');
    throw error;
  }
}

export async function removeContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.remove({ force: true });
    logger.info({ containerId }, 'Container removed');
  } catch (error: any) {
    if (error.statusCode === 404) {
      // Container doesn't exist
      return;
    }
    logger.error({ error, containerId }, 'Failed to remove container');
    throw error;
  }
}

export async function getContainerStatus(
  containerId: string
): Promise<'running' | 'exited' | 'created' | 'unknown'> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.State.Status as 'running' | 'exited' | 'created' | 'unknown';
  } catch (error: any) {
    if (error.statusCode === 404) {
      return 'unknown';
    }
    throw error;
  }
}

export async function getContainerStats(containerId: string): Promise<ContainerStats | null> {
  try {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    // Calculate CPU percentage
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuUsage = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    // Memory usage in MB
    const memoryUsage = stats.memory_stats.usage / (1024 * 1024);
    const memoryLimit = stats.memory_stats.limit / (1024 * 1024);

    return {
      cpuUsage: Math.round(cpuUsage * 100) / 100,
      memoryUsage: Math.round(memoryUsage * 100) / 100,
      memoryLimit: Math.round(memoryLimit * 100) / 100,
    };
  } catch (error) {
    logger.error({ error, containerId }, 'Failed to get container stats');
    return null;
  }
}

export async function getContainerLogs(
  containerId: string,
  tail: number = 100
): Promise<string[]> {
  try {
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    });

    // Parse Docker log format (strip header bytes)
    const logString = logs.toString('utf8');
    return logString
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        // Docker prefixes each line with 8 bytes of header
        if (line.length > 8) {
          return line.substring(8);
        }
        return line;
      });
  } catch (error) {
    logger.error({ error, containerId }, 'Failed to get container logs');
    return [];
  }
}

// Strip Docker timestamp from log line (format: 2024-01-28T09:25:06.977069875Z message)
function stripDockerTimestamp(line: string): string {
  // Docker timestamp format: YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ
  const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z\s*/;
  return line.replace(timestampRegex, '');
}

export function streamContainerLogs(
  containerId: string,
  onLog: (log: string) => void,
  onError: (error: Error) => void
): () => void {
  const container = docker.getContainer(containerId);
  let stream: Readable | null = null;
  let aborted = false;

  container
    .logs({
      stdout: true,
      stderr: true,
      follow: true,
      tail: 50,
      timestamps: false, // Don't include Docker timestamps
    })
    .then((logStream) => {
      if (aborted) {
        if (logStream && typeof (logStream as any).destroy === 'function') {
          (logStream as any).destroy();
        }
        return;
      }

      stream = logStream as unknown as Readable;

      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString('utf8').split('\n');
        for (const line of lines) {
          if (line.length > 8) {
            // Strip Docker header and any remaining timestamp
            const cleanLine = stripDockerTimestamp(line.substring(8));
            if (cleanLine.trim()) {
              onLog(cleanLine);
            }
          }
        }
      });

      stream.on('error', onError);
    })
    .catch(onError);

  // Return cleanup function
  return () => {
    aborted = true;
    if (stream) {
      stream.destroy();
    }
  };
}

async function pullImageIfNeeded(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    logger.debug({ image }, 'Image already exists');
  } catch (error: any) {
    if (error.statusCode === 404) {
      logger.info({ image }, 'Pulling image...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }
          docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
      logger.info({ image }, 'Image pulled successfully');
    } else {
      throw error;
    }
  }
}

export async function containerExists(containerName: string): Promise<boolean> {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });
    return containers.length > 0;
  } catch (error) {
    return false;
  }
}

export interface SystemStats {
  docker: {
    connected: boolean;
    version?: string;
    containers: {
      total: number;
      running: number;
      paused: number;
      stopped: number;
    };
    images: number;
  };
  resources: {
    cpuUsage: number;
    memoryUsage: number;
    memoryTotal: number;
    memoryFree: number;
  };
}

export async function getSystemStats(): Promise<SystemStats> {
  try {
    const [info, version] = await Promise.all([
      docker.info(),
      docker.version(),
    ]);

    // Calculate total resource usage from all managed containers
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ['botmanager.managed=true'] },
    });

    let totalCpuUsage = 0;
    let totalMemoryUsage = 0;

    const runningContainers = containers.filter((c) => c.State === 'running');

    for (const containerInfo of runningContainers) {
      try {
        const stats = await getContainerStats(containerInfo.Id);
        if (stats) {
          totalCpuUsage += stats.cpuUsage;
          totalMemoryUsage += stats.memoryUsage;
        }
      } catch {
        // Ignore individual container errors
      }
    }

    return {
      docker: {
        connected: true,
        version: version.Version,
        containers: {
          total: info.Containers,
          running: info.ContainersRunning,
          paused: info.ContainersPaused,
          stopped: info.ContainersStopped,
        },
        images: info.Images,
      },
      resources: {
        cpuUsage: Math.round(totalCpuUsage * 100) / 100,
        memoryUsage: Math.round(totalMemoryUsage * 100) / 100,
        memoryTotal: Math.round(info.MemTotal / (1024 * 1024 * 1024) * 100) / 100, // GB
        memoryFree: Math.round((info.MemTotal - totalMemoryUsage * 1024 * 1024) / (1024 * 1024 * 1024) * 100) / 100, // GB
      },
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get system stats');
    return {
      docker: {
        connected: false,
        containers: { total: 0, running: 0, paused: 0, stopped: 0 },
        images: 0,
      },
      resources: {
        cpuUsage: 0,
        memoryUsage: 0,
        memoryTotal: 0,
        memoryFree: 0,
      },
    };
  }
}
