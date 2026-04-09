import { FastifyInstance } from 'fastify';
import { prisma } from '../db/connection';

export async function categoryRoutes(server: FastifyInstance) {
  
  server.addHook('onRequest', async (request) => {
    await request.jwtVerify();
  });

  // Listar categorias
  server.get('/', async () => {
    return await prisma.vestigeCategory.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    });
  });

  // Vestígios por categoria (Paginado)
  server.get('/:id/vestiges', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    return await prisma.vestige.findMany({
      where: { categoryId: Number(id), deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { category: true }
    });
  });
}
