export function useToast() {
  function success(message) {
    console.log("SUCCESS:", message);
  }

  function error(message) {
    console.error("ERROR:", message);
  }

  function info(message) {
    console.info("INFO:", message);
  }

  return {
    success,
    error,
    info,
  };
}
