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

# Execute the command
exec $CMD
