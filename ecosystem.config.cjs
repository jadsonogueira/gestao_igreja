module.exports = {
  apps: [
    {
      name: "gestao-igreja",
      cwd: "C:\\apps\\gestao-igreja",
      script: "pm2-next-start.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 2000,
      env: {
        NODE_ENV: "production",
        PORT: "3001",

        // opcional colocar aqui também:
        // GOOGLE_CLIENT_ID: "....",
        // GOOGLE_CLIENT_SECRET: "....",
        // GOOGLE_REDIRECT_URI: "https://gestao-igreja.synkra.ca/api/google/oauth/callback",
      },
    },
  ],
};