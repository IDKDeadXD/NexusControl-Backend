import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as filesService from './files.service.js';
import { prisma } from '../../utils/database.js';
import { authenticate } from '../../middleware/authenticate.js';
import { logger } from '../../utils/logger.js';

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // List files in a bot's directory
  app.get(
    '/:botId/files',
    async (
      request: FastifyRequest<{
        Params: { botId: string };
        Querystring: { path?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: request.params.botId },
        });

        if (!bot) {
          return reply.status(404).send({ success: false, error: 'Bot not found' });
        }

        const relativePath = request.query.path || '';
        const files = await filesService.listFiles(bot.codeDirectory, relativePath);

        return reply.send({ success: true, data: files });
      } catch (error: any) {
        logger.error({ error }, 'Failed to list files');
        return reply.status(400).send({
          success: false,
          error: error.message || 'Failed to list files',
        });
      }
    }
  );

  // Read a file's content
  app.get(
    '/:botId/files/content',
    async (
      request: FastifyRequest<{
        Params: { botId: string };
        Querystring: { path: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: request.params.botId },
        });

        if (!bot) {
          return reply.status(404).send({ success: false, error: 'Bot not found' });
        }

        const content = await filesService.readFile(bot.codeDirectory, request.query.path);
        return reply.send({ success: true, data: { content } });
      } catch (error: any) {
        logger.error({ error }, 'Failed to read file');
        return reply.status(400).send({
          success: false,
          error: error.message || 'Failed to read file',
        });
      }
    }
  );

  // Save/update a file's content
  app.put(
    '/:botId/files/content',
    async (
      request: FastifyRequest<{
        Params: { botId: string };
        Body: { path: string; content: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: request.params.botId },
        });

        if (!bot) {
          return reply.status(404).send({ success: false, error: 'Bot not found' });
        }

        const { path, content } = request.body;
        await filesService.writeFile(bot.codeDirectory, path, content);

        return reply.send({ success: true, message: 'File saved' });
      } catch (error: any) {
        logger.error({ error }, 'Failed to save file');
        return reply.status(400).send({
          success: false,
          error: error.message || 'Failed to save file',
        });
      }
    }
  );

  // Create a new file
  app.post(
    '/:botId/files/create',
    async (
      request: FastifyRequest<{
        Params: { botId: string };
        Body: { path: string; isDirectory: boolean };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: request.params.botId },
        });

        if (!bot) {
          return reply.status(404).send({ success: false, error: 'Bot not found' });
        }

        const { path, isDirectory } = request.body;

        if (isDirectory) {
          await filesService.createDirectory(bot.codeDirectory, path);
        } else {
          await filesService.createFile(bot.codeDirectory, path);
        }

        return reply.status(201).send({ success: true, message: 'Created successfully' });
      } catch (error: any) {
        logger.error({ error }, 'Failed to create file/directory');
        return reply.status(400).send({
          success: false,
          error: error.message || 'Failed to create',
        });
      }
    }
  );

  // Delete a file or directory
  app.delete(
    '/:botId/files',
    async (
      request: FastifyRequest<{
        Params: { botId: string };
        Querystring: { path: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: request.params.botId },
        });

        if (!bot) {
          return reply.status(404).send({ success: false, error: 'Bot not found' });
        }

        await filesService.deleteFile(bot.codeDirectory, request.query.path);
        return reply.send({ success: true, message: 'Deleted successfully' });
      } catch (error: any) {
        logger.error({ error }, 'Failed to delete');
        return reply.status(400).send({
          success: false,
          error: error.message || 'Failed to delete',
        });
      }
    }
  );

  // Rename/move a file or directory
  app.patch(
    '/:botId/files/rename',
    async (
      request: FastifyRequest<{
        Params: { botId: string };
        Body: { oldPath: string; newPath: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: request.params.botId },
        });

        if (!bot) {
          return reply.status(404).send({ success: false, error: 'Bot not found' });
        }

        const { oldPath, newPath } = request.body;
        await filesService.renameFile(bot.codeDirectory, oldPath, newPath);

        return reply.send({ success: true, message: 'Renamed successfully' });
      } catch (error: any) {
        logger.error({ error }, 'Failed to rename');
        return reply.status(400).send({
          success: false,
          error: error.message || 'Failed to rename',
        });
      }
    }
  );

  // Upload a file
  app.post(
    '/:botId/files/upload',
    async (
      request: FastifyRequest<{
        Params: { botId: string };
        Querystring: { path?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: request.params.botId },
        });

        if (!bot) {
          return reply.status(404).send({ success: false, error: 'Bot not found' });
        }

        const data = await request.file();
        if (!data) {
          return reply.status(400).send({ success: false, error: 'No file provided' });
        }

        const targetDir = request.query.path || '';
        const targetPath = targetDir ? `${targetDir}/${data.filename}` : data.filename;
        const buffer = await data.toBuffer();

        await filesService.uploadFile(bot.codeDirectory, targetPath, buffer);

        return reply.send({ success: true, message: 'File uploaded', data: { path: targetPath } });
      } catch (error: any) {
        logger.error({ error }, 'Failed to upload file');
        return reply.status(400).send({
          success: false,
          error: error.message || 'Failed to upload',
        });
      }
    }
  );

  // Get directory size/stats
  app.get(
    '/:botId/files/stats',
    async (
      request: FastifyRequest<{ Params: { botId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: request.params.botId },
        });

        if (!bot) {
          return reply.status(404).send({ success: false, error: 'Bot not found' });
        }

        const totalSize = await filesService.getDirectorySize(bot.codeDirectory);

        return reply.send({
          success: true,
          data: {
            totalSize,
            totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
          },
        });
      } catch (error: any) {
        logger.error({ error }, 'Failed to get stats');
        return reply.status(400).send({
          success: false,
          error: error.message || 'Failed to get stats',
        });
      }
    }
  );
}
