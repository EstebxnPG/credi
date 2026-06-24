FROM node:20-alpine

WORKDIR /app

# Copia dependencias primero (mejor uso de caché de Docker)
COPY package.json package-lock.json* ./
RUN npm ci

# Copia el resto del código
COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
