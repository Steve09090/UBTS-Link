class ServiceError(Exception):
    """Business-rule failure. `status` is the HTTP status the API should return."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message
