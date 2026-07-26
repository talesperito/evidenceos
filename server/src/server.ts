import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';

import { prisma } from './db/connection';
import { authRoutes } from './routes/authRoutes';
import { vestigeRoutes } from './routes/vestigeRoutes';
import { categoryRoutes } from './routes/categoryRoutes';
import { userRoutes } from './routes/userRoutes';
import { auditRoutes } from './routes/auditRoutes';
import { custodyStandardRoutes } from './routes/custodyStandardRoutes';
import { pcnetRoutes } from './routes/pcnetRoutes';

const server = fastify({
  logger: true,
});

// Plugins
server.register(cors, {
  origin: true,
  credentials: true,
  // O @fastify/cors usa por padrão apenas 'GET,HEAD,POST'. Sem declarar os demais verbos,
  // o preflight de PUT/DELETE é recusado pelo navegador e a requisição nunca chega aqui.
  // Em produção isso não aparecia (web e api são o mesmo domínio, logo não há preflight),
  // mas em dev (localhost:5173 → localhost:3000) quebrava toda edição e exclusão.
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

server.register(jwt, {
  secret: process.env.JWT_SECRET ?? (() => {
    throw new Error('JWT_SECRET is not set');
  })(),
});

server.register(cookie);

// Registro de Rotas
server.register(authRoutes, { prefix: '/api/auth' });
server.register(vestigeRoutes, { prefix: '/api/vestiges' });
server.register(pcnetRoutes, { prefix: '/api/vestiges' });
server.register(categoryRoutes, { prefix: '/api/categories' });
server.register(userRoutes, { prefix: '/api/admin/users' });
server.register(auditRoutes, { prefix: '/api/audit' });
server.register(custodyStandardRoutes, { prefix: '/api/custody-standards' });

// Rota de Health Check
server.get('/api/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    };
  } catch (error) {
    return reply.status(500).send({ 
      status: 'error', 
      database: 'disconnected',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});



// Inicialização
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Servidor EvidenceOS rodando em http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

export { server };
