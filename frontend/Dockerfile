FROM node:20-alpine

WORKDIR /app

# Copia dependencias primero (mejor uso de caché de Docker)
COPY package.json package-lock.json* ./
RUN npm install

# Copia el resto del código
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]