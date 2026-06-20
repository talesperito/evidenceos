# syntax=docker/dockerfile:1

# ---- Build stage: compila o frontend e gera o dist/ ----
FROM node:20-alpine AS build
WORKDIR /app

# Instala dependências primeiro (melhor cache de camadas)
COPY package*.json ./
RUN npm install

# VITE_API_URL precisa existir em TEMPO DE BUILD (o Vite injeta no bundle).
# O EasyPanel repassa as variáveis do serviço como build args.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN npm run build

# ---- Runtime stage: Nginx servindo apenas os arquivos estáticos ----
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
