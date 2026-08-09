// Re-export the shared socket instance from the root socket module
// so components can import from either location
export { default, BACKEND_URL } from '../socket';
