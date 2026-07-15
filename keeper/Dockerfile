FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./
# Keepers should die loudly and be restarted by the orchestrator.
CMD ["node", "index.mjs"]
