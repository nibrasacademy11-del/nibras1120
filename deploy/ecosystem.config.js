// pm2 keeps the app running on the server and starts it again after a crash or a reboot.
// The settings themselves (database, secrets, email, Zoom) are in /var/www/nibras/.env.
module.exports = {
    apps: [{
        name: 'nibras',
        script: 'server.js',
        cwd: __dirname + '/..',
        instances: 1,
        env: {
            NODE_ENV: 'production',
            HOST: '127.0.0.1',
            PORT: 3000
        },
        // restart before the app takes too much of the 4 GB (the database needs its share)
        max_memory_restart: '700M',
        time: true,
        out_file: '/home/nibras/logs/nibras.out.log',
        error_file: '/home/nibras/logs/nibras.err.log'
    }]
};
