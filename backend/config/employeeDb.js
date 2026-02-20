const mongoose = require('mongoose');

let employeeConn = null;

const connectEmployeeDB = async () => {
    try {
        const uri = process.env.MONGO_EMPLOYEE_URI;
        if (!uri) {
            console.warn('[Employee DB] MONGO_EMPLOYEE_URI is not set in environment variables.');
            return null;
        }

        if (employeeConn) return employeeConn;

        employeeConn = await mongoose.createConnection(uri, {
            serverSelectionTimeoutMS: 5000,
        });

        console.log('Employee Database Connected ✅');
        
        employeeConn.on('error', (err) => {
            console.error('[Employee DB] Connection error:', err);
        });

        return employeeConn;
    } catch (error) {
        console.error('Error connecting to Employee database:', error.message);
        return null;
    }
};

const getEmployeeConnection = () => {
    return employeeConn;
};

module.exports = { connectEmployeeDB, getEmployeeConnection };
