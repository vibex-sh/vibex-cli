#!/bin/bash

# Publish script for vibex CLI
# Usage: ./publish.sh [patch|minor|major|version]
# Example: ./publish.sh patch
# Example: ./publish.sh 1.2.3

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
VERSION_CHANGED=false
PUBLISH_SUCCESS=false

# Rollback function
rollback_version() {
  if [ "$VERSION_CHANGED" = true ] && [ "$PUBLISH_SUCCESS" = false ]; then
    echo -e "${YELLOW}Rolling back version to ${CURRENT_VERSION}...${NC}"
    npm version $CURRENT_VERSION --no-git-tag-version || true
    VERSION_CHANGED=false  # Mark as rolled back to prevent double rollback
    echo -e "${GREEN}Version rolled back to ${CURRENT_VERSION}${NC}"
  fi
}

# Trap to rollback on error
trap rollback_version ERR
trap rollback_version EXIT

echo -e "${GREEN}Current version: ${CURRENT_VERSION}${NC}"

# Determine new version
if [ -z "$1" ]; then
  echo -e "${RED}Error: Version type or version number required${NC}"
  echo "Usage: ./publish.sh [patch|minor|major|version]"
  echo "Example: ./publish.sh patch"
  echo "Example: ./publish.sh 1.2.3"
  exit 1
fi

VERSION_TYPE=$1

# Check if it's a semantic version (x.y.z) or a version type (patch/minor/major)
if [[ $VERSION_TYPE =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION=$VERSION_TYPE
  echo -e "${GREEN}Setting version to: ${NEW_VERSION}${NC}"
  npm version $NEW_VERSION --no-git-tag-version
  VERSION_CHANGED=true
else
  # Validate version type
  if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: Invalid version type. Use: patch, minor, or major${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}Bumping ${VERSION_TYPE} version...${NC}"
  npm version $VERSION_TYPE --no-git-tag-version
  VERSION_CHANGED=true
  NEW_VERSION=$(node -p "require('./package.json').version")
fi

echo -e "${GREEN}New version: ${NEW_VERSION}${NC}"

# Check if user is logged in to npm
if ! npm whoami &> /dev/null; then
  echo -e "${RED}Error: Not logged in to npm${NC}"
  echo "Run: npm login"
  rollback_version
  exit 1
fi

# Confirm before publishing
echo -e "${YELLOW}Ready to publish ${NEW_VERSION} to npm${NC}"
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Publish cancelled${NC}"
  # Revert version change
  rollback_version
  exit 1
fi

# Publish to npm
echo -e "${GREEN}Publishing to npm...${NC}"
if npm publish; then
  PUBLISH_SUCCESS=true
  echo -e "${GREEN}✓ Successfully published vibex@${NEW_VERSION}${NC}"
else
  echo -e "${RED}✗ Failed to publish to npm${NC}"
  rollback_version
  exit 1
fi

# Optionally commit and tag (uncomment if desired)
# echo -e "${GREEN}Creating git commit and tag...${NC}"
# git add package.json
# git commit -m "chore: bump version to ${NEW_VERSION}"
# git tag "v${NEW_VERSION}"
# echo -e "${GREEN}✓ Git commit and tag created${NC}"
# echo -e "${YELLOW}Don't forget to push: git push && git push --tags${NC}"

