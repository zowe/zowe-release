#!/bin/sh

# This script iterates through all sub actions and run ncc command to compile and build javascript

if [ ! -f "./node_modules/.bin/ncc" ]; then
  echo "ncc is not installed in node_modules. Please run 'npm ci' before running this script."
  exit 1
fi

for file in $(find . -type f -name "index.js" -maxdepth 2)
do
    cd $(echo $file | cut -d'/' -f 2)
    npx ncc build index.js --license licenses.txt
    cd ..
done


