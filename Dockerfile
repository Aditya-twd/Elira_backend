FROM node:20-alpine AS base

WORKDIR /app

# Install production dependencies first for layer cache reuse.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy only runtime dependencies and application code.
COPY --from=base /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY scripts ./scripts

# Run as the default non-root node user.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "require('http').get('http://127.0.0.1:5000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));"

CMD ["node", "src/index.js"]
