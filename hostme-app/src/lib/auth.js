import NextAuth from "next-auth";
import CredentialsProviderModule from "next-auth/providers/credentials";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { verifyPassword } from "@/lib/password";

const CredentialsProvider = CredentialsProviderModule.default || CredentialsProviderModule;
const NextAuthHandler = NextAuth.default || NextAuth;

const authConfig = {
    session: { strategy: "jwt" },
    providers: [
        CredentialsProvider({
            name: "HostMe",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                await connectToDatabase();
                const user = await User.findOne({ email: credentials.email.toLowerCase() }).lean();
                if (!user || !user.passwordHash) {
                    return null;
                }

                const valid = verifyPassword(credentials.password, user.passwordHash);
                if (!valid) {
                    return null;
                }

                if (!user.isEmailVerified) {
                    return null;
                }

                return {
                    id: user._id.toString(),
                    name: user.name || user.profile?.fullName || user.email,
                    email: user.email,
                    roles: Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : ["guest"],
                    isEmailVerified: Boolean(user.isEmailVerified),
                    profileCompleted: Boolean(user.profileCompleted),
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : ["guest"];
                token.isEmailVerified = Boolean(user.isEmailVerified);
                token.profileCompleted = Boolean(user.profileCompleted);
            }

            return token;
        },
        async session({ session, token }) {
            session.user = {
                ...session.user,
                id: token.sub,
                roles: token.roles || ["guest"],
                isEmailVerified: Boolean(token.isEmailVerified),
                profileCompleted: Boolean(token.profileCompleted),
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
