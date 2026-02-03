#!/bin/sh
cd /usr/src/app/

# Build the base command
CMD="node index.js -h $DATABASE_HOST -p $DATABASE_PASSWORD -d $DATABASE_NAME -u $DATABASE_USER"

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
