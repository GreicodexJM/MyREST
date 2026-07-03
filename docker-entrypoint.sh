#!/bin/sh
cd /usr/src/app/

# Check if DATABASE_URL is provided
if [ -n "$DATABASE_URL" ]; then
  # Use DATABASE_URL for connection
  CMD="node index.js --databaseUrl $DATABASE_URL"
else
  # Build the base command with individual parameters
  CMD="node index.js -h $DATABASE_HOST -p $DATABASE_PASSWORD -d $DATABASE_NAME -u $DATABASE_USER"
fi

# Add JWT secret if provided
if [ -n "$JWT_SECRET" ]; then
  CMD="$CMD --jwtSecret $JWT_SECRET"
fi

# Add JWT required flag if set to true
if [ "$JWT_REQUIRED" = "true" ]; then
  CMD="$CMD --jwtRequired"
fi

if [ -n "$CORS_ORIGIN" ]; then
  CMD="$CMD --corsOrigin $CORS_ORIGIN"
fi

# Add storage folder for file uploads/downloads if provided
if [ -n "$STORAGE_FOLDER" ]; then
  CMD="$CMD -s $STORAGE_FOLDER"
fi

# Multi-database mode: comma-separated list of databases to expose
if [ -n "$DATABASES" ]; then
  CMD="$CMD --databases $DATABASES"
fi

# Execute the command
exec $CMD
