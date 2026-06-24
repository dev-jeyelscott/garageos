function main() {
  console.log('GarageOS worker started.');
  console.log('Health: ok');

  // Keep process alive for local/runtime verification.
  setInterval(() => {
    console.log('GarageOS worker heartbeat.');
  }, 60_000);
}

main();
