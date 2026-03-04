FROM node:20-alpine

WORKDIR /app

# Build-Tools + Git für native Dependencies
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
