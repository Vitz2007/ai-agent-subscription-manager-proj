# Use a lightweight Node.js version
FROM node:20-alpine

# Create a directory inside the container
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install needed dependencies
RUN npm install

# 5. Copy the remaining code
COPY . .

# Reveal the dashboard port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]