FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better Docker layer caching)
COPY package.json ./
RUN npm install --production --no-audit --no-fund --silent

# Copy app code
COPY server.js ./

# Default upload dir, will be overridden by volume mount
RUN mkdir -p /uploads

EXPOSE 4000

CMD ["node", "server.js"]
