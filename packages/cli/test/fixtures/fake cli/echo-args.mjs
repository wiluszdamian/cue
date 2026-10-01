// Stands in for playwright-cli: prints exactly the arguments it was given.
process.stdout.write(JSON.stringify(process.argv.slice(2)));
