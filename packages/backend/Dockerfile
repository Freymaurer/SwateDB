FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/backend/package.json ./packages/backend/

RUN npm install

COPY packages/backend ./packages/backend

WORKDIR /app/packages/backend

CMD ["node", "-e", "console.log('backend Docker scaffold: implementation pending')"]
