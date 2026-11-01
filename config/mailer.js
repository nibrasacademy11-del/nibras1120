const nodemailer = require('nodemailer');

const isMailConfigured = () => !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);

function createTransporter() {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
        port: parseInt(process.env.EMAIL_PORT, 10) || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: {
            rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
    });
}

module.exports = { isMailConfigured, createTransporter };
