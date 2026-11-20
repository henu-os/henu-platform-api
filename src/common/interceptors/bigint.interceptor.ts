import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Enable native BigInt JSON serialization globally
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    const n = Number(this);
    return Number.isSafeInteger(n) ? n : this.toString();
  };
}

export function sanitizeBigInt(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'bigint') {
    const num = Number(data);
    return Number.isSafeInteger(num) ? num : data.toString();
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeBigInt);
  }
  if (
    typeof data === 'object' &&
    !(data instanceof Date) &&
    !(data instanceof RegExp) &&
    !(data instanceof Buffer)
  ) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      result[key] = sanitizeBigInt(data[key]);
    }
    return result;
  }
  return data;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => sanitizeBigInt(data)));
  }
}
