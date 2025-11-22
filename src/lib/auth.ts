import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createAuthClient, createPureClient } from "@/lib/supabase/server";

/**
 * NextAuth Configuration
 * Supabase와 통합된 인증 설정
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "user@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("이메일과 비밀번호를 입력해주세요.");
        }

        // Use auth client for signin (anon key)
        const authClient = await createAuthClient();

        // Supabase Auth로 로그인
        const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (authError || !authData.user) {
          // 이메일 미확인 에러 체크
          if (authError?.message?.includes('Email not confirmed')) {
            throw new Error("이메일 주소를 확인해주세요. 받은편지함에서 확인 메일을 확인하세요.");
          }
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        // 이메일 확인 여부 체크
        if (!authData.user.email_confirmed_at) {
          throw new Error("이메일 주소를 확인해주세요. 받은편지함에서 확인 메일을 확인하세요.");
        }

        // Use service role client for database operations
        const supabase = await createPureClient();

        // 사용자 프로필 조회
        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("*, user_roles(name, display_name, permissions)")
          .eq("id", authData.user.id)
          .single();

        if (profileError || !profile) {
          // 프로필이 없으면 기본 프로필 생성
          const { data: newProfile } = await supabase
            .from("user_profiles")
            .insert({
              id: authData.user.id,
              email: authData.user.email!,
              full_name: authData.user.user_metadata?.full_name || null,
              preferences: {},
              is_active: true,
            })
            .select("*, user_roles(name, display_name, permissions)")
            .single();

          return {
            id: authData.user.id,
            email: authData.user.email!,
            name: authData.user.user_metadata?.full_name || authData.user.email,
            role: "viewer", // 기본 role
            roleId: null,
            permissions: {},
          };
        }

        // 마지막 로그인 시간 업데이트
        await supabase
          .from("user_profiles")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", authData.user.id);

        return {
          id: authData.user.id,
          email: profile.email,
          name: profile.full_name || profile.email,
          role: profile.user_roles?.name || "viewer",
          roleId: profile.role_id,
          permissions: profile.user_roles?.permissions || {},
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // 첫 로그인 시 user 정보를 token에 저장
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as any).role;
        token.roleId = (user as any).roleId;
        token.permissions = (user as any).permissions;
      }
      return token;
    },

    async session({ session, token }) {
      // token 정보를 session에 전달
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.role = token.role as string;
        session.user.roleId = token.roleId as string;
        session.user.permissions = token.permissions as any;
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,

  debug: process.env.NODE_ENV === "development",
};

// 타입 확장
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      roleId: string | null;
      permissions: any;
    };
  }

  interface User {
    role?: string;
    roleId?: string | null;
    permissions?: any;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    roleId?: string | null;
    permissions?: any;
  }
}
