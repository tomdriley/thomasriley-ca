// Import the required modules and dependencies
import dotenv from "dotenv";
import axios, { AxiosError } from "axios";
import { err, ok, Result } from "neverthrow";

// Define a class for uncaught errors
class UncaughtError {
  constructor(readonly error: unknown) {}
}

type AxiosResult<Type> = Result<Type, AxiosError | UncaughtError>;

// Load environment variables from a .env file if available
// This is useful for development and testing environments
dotenv.config();

// getEnv is a function that retrieves the value of an environment variable
// It takes one parameter, envVarName, which is the name of the environment variable
const getEnv = (envVarName: string): Result<string, UncaughtError> => {
  // Check if the environment variable is defined
  if (process.env[envVarName] === undefined) {
    // If the environment variable is not defined, throw an error with a message
    return err(
      new UncaughtError(`environment variable ${envVarName} is not defined`)
    );
  }
  // If the environment variable is defined, return its value as a string
  return ok(String(process.env[envVarName]));
};

// Define an async function to fetch data from a service
async function fetchDataFromService<ReturnType>(
  url: string
): Promise<AxiosResult<ReturnType>> {
  // Send a GET request to the provided URL
  try {
    const response = await axios.get<ReturnType>(url);
    // Extract the data from the response
    const data = response.data;
    // Return the data
    return ok(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return err(error);
    } else {
      return err(new UncaughtError(error));
    }
  }
}

// Export the getEnv and fetchDataFromService functions for use in other modules
export { getEnv, fetchDataFromService, UncaughtError, AxiosResult };
