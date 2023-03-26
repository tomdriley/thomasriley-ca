// Import the required modules and dependencies
import dotenv from "dotenv";
import axios from "axios";

// Load environment variables from a .env file if available
// This is useful for development and testing environments
dotenv.config();

// getEnv is a function that retrieves the value of an environment variable
// It takes one parameter, envVarName, which is the name of the environment variable
const getEnv = (envVarName: string): string => {
  // Check if the environment variable is defined
  if (process.env[envVarName] === undefined) {
    // If the environment variable is not defined, throw an error with a message
    throw `environment variable ${envVarName} is not defined`;
  }

  // If the environment variable is defined, return its value as a string
  return String(process.env[envVarName]);
};

// Define an async function to fetch data from a service
const fetchDataFromService = async (url: string) => {
  // Send a GET request to the provided URL
  const response = await axios.get(url);
  // Extract the data from the response
  const data = response.data;
  // Return the data
  return data;
};

// Export the getEnv and fetchDataFromService functions for use in other modules
export { getEnv, fetchDataFromService };
