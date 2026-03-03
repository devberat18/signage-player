import mqtt from "mqtt";

const MQTT_URL = process.env.MQTT_URL || "ws://localhost:9001";
const DEVICE_ID = process.env.DEVICE_ID || "tizen-001";

const client = mqtt.connect(MQTT_URL, {
  clientId: `tester-${Math.random().toString(16).slice(2)}`,
  reconnectPeriod: 1000,
});

client.on("connect", () => {
  console.log("CONNECTED");

  client.subscribe(`players/${DEVICE_ID}/events`, { qos: 1 });

  const command = {
    command: "play",
    correlationId: "play-000001",
    timestamp: 1710000000000,
    payload: { format: "png" },
  };

  client.publish(
    `players/${DEVICE_ID}/commands`,
    JSON.stringify(command),
    { qos: 1 },
    () => console.log("COMMAND SENT:", command),
  );
});

client.on("message", (topic, payload) => {
  console.log("EVENT RECEIVED:", topic);
  console.log(payload.toString());
});

client.on("error", (err) => {
  console.error("MQTT ERROR:", err);
});
