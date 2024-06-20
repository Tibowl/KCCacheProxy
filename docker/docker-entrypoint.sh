file=./src/$1.js

shift

if [ -f $file ]; then
  node $file $@
else
  echo "Command not found"
fi
