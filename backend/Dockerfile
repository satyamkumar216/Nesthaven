# 1. Use a lightweight Node.js version
FROM node:18-alpine

# 2. Install OS-level dependencies required for Prisma to run on Alpine Linux
RUN apk add --no-cache openssl libc6-compat

# 3. Set the working directory inside the container
WORKDIR /app

# 4. Copy only package files first to cache dependencies
COPY package*.json ./

# 5. Install all dependencies inside the Linux container
RUN npm install

# 6. Copy the Prisma schema folder to generate the client before copying all source code
# (This keeps builds fast if you only change regular code lines later)
COPY prisma ./prisma/

# 7. Generate the Prisma Client specifically for this Linux environment
RUN npx prisma generate

# 8. Copy the rest of your backend source code into the container
COPY . .

# 9. Build the NestJS application into JavaScript (dist folder)
RUN npm run build

# 10. Expose the port your NestJS app runs on
EXPOSE 3001

# 11. Automatically sync database schema changes, then launch the compiled NestJS application
CMD ["sh", "-c", "npx prisma db push && node dist/main.js"]