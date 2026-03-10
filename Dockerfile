FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first (better Docker layer caching)
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the rest of the project
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["node", "server/server.js"]
