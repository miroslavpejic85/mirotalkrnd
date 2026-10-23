FROM node:24.22.1-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY public ./public

EXPOSE 4010

CMD ["npm", "start"]
