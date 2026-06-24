function main() {
  console.log('GarageOS scheduler started.');
  console.log('Health: ok');

  // Keep process alive for local/runtime verification.
  setInterval(() => {
    console.log('GarageOS scheduler heartbeat.');
  }, 60_000);
}

main();
