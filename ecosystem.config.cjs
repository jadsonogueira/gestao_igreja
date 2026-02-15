module.exports = {
  apps: [
    {
      name: "gestao-igreja",
      cwd: "C:\\apps\\gestao-igreja",
      script: "node_modules\\next\\dist\\bin\\next",
      args: "start -p 3001",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 2000,
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};
