import 'next-auth';

declare module 'next-auth' {
  interface User {
    restaurantId?: string;
  }

  interface Session {
    user: {
      id?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      restaurantId?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    restaurantId?: string;
  }
}