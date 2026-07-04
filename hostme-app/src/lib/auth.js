import NextAuth from "next-auth";
import CredentialsProviderModule from "next-auth/providers/credentials";

const CredentialsProvider = CredentialsProviderModule.default || CredentialsProviderModule;
const NextAuthHandler = NextAuth.default || NextAuth;

const authConfig = {
    session: { strategy: "jwt" },
    providers: [
        CredentialsProvider({
            name: "HostMe",
            credentials: {
                email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
                if (!credentials?.email) {
                    return null;
                }

                return {
                    id: "demo-guest",
                    name: "Demo Guest",
                    email: credentials.email,
                    roles: ["guest"],
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : ["guest"];
            }

            return token;
        },
        async session({ session, token }) {
            session.user = {
                ...session.user,
                id: token.sub,
                roles: token.roles || ["guest"],
            };

            return session;
        },
    },
    pages: {
        signIn: "/signin",
    },
};

const handler = NextAuthHandler(authConfig);

export const { handlers, signIn, signOut, auth } = handler;
export default handler;
