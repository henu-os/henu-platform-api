import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Rfc7807ExceptionFilter } from './rfc7807-exception.filter';

describe('Rfc7807ExceptionFilter', () => {
  let filter: Rfc7807ExceptionFilter;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  const mockRequest = {
    headers: { 'x-request-id': 'req-12345' },
    originalUrl: '/api/v1/test',
  };

  const mockArgumentsHost = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    filter = new Rfc7807ExceptionFilter();
    jest.clearAllMocks();
  });

  it('should format HttpException into RFC 7807 problem details JSON', () => {
    const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://api.henuos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'Resource not found',
        instance: '/api/v1/test',
        code: 'NOT_FOUND',
        requestId: 'req-12345',
      }),
    );
  });

  it('should format unexpected standard Error as 500 problem details', () => {
    const exception = new Error('Database crash');

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://api.henuos.com/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Database crash',
        code: 'INTERNAL_SERVER_ERROR',
      }),
    );
  });
});
