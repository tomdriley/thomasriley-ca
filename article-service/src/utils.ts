import dotenv from "dotenv";

// Get .env if available
dotenv.config();

const getEnv = (envVarName: string): string => {
  if (process.env[envVarName] === undefined) {
    throw `environment variable ${envVarName} is not defined`;
  }

  return String(process.env[envVarName]);
};

export { getEnv };
