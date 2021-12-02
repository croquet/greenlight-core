#!/bin/sh

if [ ! -d node_modules ]
then
    npm ci
fi

if tail -1 croquet/croquet.min.js | grep sourceMappingURL > /dev/null
then
    echo "You are going to deploying a dev lib. Quitting."
    exit 1
fi

rm -rf dist
mkdir -p dist/meta dist/croquet

META=`git log --no-walk|grep -v '^Author' |head -2 |tr '\n' ' '`
COMMIT=`echo ${META} | awk '{print $2}'`

echo ${META} > dist/meta/version.txt

rsync -r --exclude='icons/*\.svg' --exclude='landing/*\.svg' --exclude='avatar/*\.svg' \
      ./icon.png ./assets croquet \
      index.html landing.html landing-loader.js landing.js text-chat.svg text-chat.html \
      greenlight.svg greenlight.js apiKey.js \
      dist

npx rollup src/p.js --config rollup.config.js --file dist/src/p.js --format es

cp ./src/{text-chat.js,text-chat.css,pitch.css} dist/src
