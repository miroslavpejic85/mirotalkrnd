FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY public ./public

EXPOSE 4010

CMD ["npm", "start"]
