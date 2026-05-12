import 'next-auth';

declare module 'next-auth' {
  interface User {
    role?: string;
    restaurantId?: string;
  }

  interface Session {
    user: {
      id?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      restaurantId?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    restaurantId?: string;
  }
}
