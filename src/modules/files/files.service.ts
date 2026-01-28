import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

export async function listFiles(baseDir: string, relativePath: string = ''): Promise<FileInfo[]> {
  const fullPath = path.join(baseDir, relativePath);

  // Security: ensure we don't escape the base directory
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Access denied: path traversal attempt');
  }

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      const entryPath = path.join(relativePath, entry.name);
      const stats = await fs.stat(path.join(baseDir, entryPath));

      files.push({
        name: entry.name,
        path: entryPath,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modified: stats.mtime,
      });
    }

    // Sort: directories first, then alphabetically
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return files;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function readFile(baseDir: string, relativePath: string): Promise<string> {
  const fullPath = path.join(baseDir, relativePath);

  // Security check
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Access denied: path traversal attempt');
  }

  const content = await fs.readFile(fullPath, 'utf-8');
  return content;
}

export async function writeFile(baseDir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(baseDir, relativePath);

  // Security check
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Access denied: path traversal attempt');
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');

  logger.info({ path: relativePath }, 'File written');
}

export async function createFile(baseDir: string, relativePath: string, content: string = ''): Promise<void> {
  const fullPath = path.join(baseDir, relativePath);

  // Security check
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Access denied: path traversal attempt');
  }

  // Check if file already exists
  try {
    await fs.access(fullPath);
    throw new Error('File already exists');
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');

  logger.info({ path: relativePath }, 'File created');
}

export async function createDirectory(baseDir: string, relativePath: string): Promise<void> {
  const fullPath = path.join(baseDir, relativePath);

  // Security check
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Access denied: path traversal attempt');
  }

  await fs.mkdir(fullPath, { recursive: true });
  logger.info({ path: relativePath }, 'Directory created');
}

export async function deleteFile(baseDir: string, relativePath: string): Promise<void> {
  const fullPath = path.join(baseDir, relativePath);

  // Security check
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Access denied: path traversal attempt');
  }

  const stats = await fs.stat(fullPath);

  if (stats.isDirectory()) {
    await fs.rm(fullPath, { recursive: true });
  } else {
    await fs.unlink(fullPath);
  }

  logger.info({ path: relativePath }, 'File/directory deleted');
}

export async function renameFile(baseDir: string, oldPath: string, newPath: string): Promise<void> {
  const fullOldPath = path.join(baseDir, oldPath);
  const fullNewPath = path.join(baseDir, newPath);

  // Security check
  const resolvedOld = path.resolve(fullOldPath);
  const resolvedNew = path.resolve(fullNewPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedOld.startsWith(resolvedBase) || !resolvedNew.startsWith(resolvedBase)) {
    throw new Error('Access denied: path traversal attempt');
  }

  await fs.rename(fullOldPath, fullNewPath);
  logger.info({ oldPath, newPath }, 'File renamed');
}

export async function uploadFile(
  baseDir: string,
  relativePath: string,
  buffer: Buffer
): Promise<void> {
  const fullPath = path.join(baseDir, relativePath);

  // Security check
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Access denied: path traversal attempt');
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);

  logger.info({ path: relativePath, size: buffer.length }, 'File uploaded');
}

export async function getDirectorySize(baseDir: string): Promise<number> {
  let totalSize = 0;

  async function calculateSize(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await calculateSize(entryPath);
      } else {
        const stats = await fs.stat(entryPath);
        totalSize += stats.size;
      }
    }
  }

  try {
    await calculateSize(baseDir);
  } catch (error) {
    // Directory might not exist yet
  }

  return totalSize;
}
