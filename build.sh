#!/bin/bash
set -e

echo "Running tests..."
npm test

echo "Cleaning build directory..."
rm -rf build
mkdir -p build

echo "Copying extension files..."
cp manifest.json options.html options.js -t build/
cp -r content src icons -t build/

echo "Building XPI..."
cd build
zip -r ../mozilla-helper.xpi .

echo "✔ Done!  → mozilla-helper.xpi"
