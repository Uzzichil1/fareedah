import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

// In next-auth@5.0.0-beta.31, `next-auth/jwt` only re-exports the `JWT`
// interface from `@auth/core/jwt` via `export *`. Augmenting the re-exporting
// module does not merge into the original declaration the `jwt`/`session`
// callbacks actually use, so we also augment the source module here.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
