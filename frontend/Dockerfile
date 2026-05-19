FROM node:20-alpine

# Required for Next.js on Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files first for strict layer caching
COPY package*.json ./
RUN npm install

# Copy all source files
COPY . .

# Expose local development server port
EXPOSE 3000

# Set environment anchors so NextJS binds to all network layers inside Docker
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

CMD ["npm", "run", "dev"]