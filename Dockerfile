# Use the official Node.js image with Alpine for a smaller footprint
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the application port (make sure this matches process.env.PORT)
EXPOSE 8005

# Start the application
CMD [ "npm", "start" ]
