import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import app from './app.js';
import connectDatabase from './src/config/database.js';
import AcademyUser from './src/model/academyUserModel.js';
import ChatMessage from './src/model/chatMessageModel.js';
import { notifyUser } from './src/services/notificationService.js';
import { runSubscriptionExpiryReminders } from './src/services/subscriptionReminderService.js';

const port = Number(process.env.PORT || 5000);
// Debug (temporary)
console.log("MONGO_URI =", JSON.stringify(process.env.MONGO_URI));
console.log("Starts with mongodb://", process.env.MONGO_URI?.startsWith("mongodb://"));
console.log("Starts with mongodb+srv://", process.env.MONGO_URI?.startsWith("mongodb+srv://"));

await connectDatabase();


const server = createServer(app);

// Long course uploads can take several minutes on ordinary connections.
server.requestTimeout = Math.max(
  10 * 60 * 1000,
  Number(process.env.UPLOAD_TIMEOUT_MS) || 2 * 60 * 60 * 1000
);

const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || true;

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

app.set('io', io);

setTimeout(() => {
  runSubscriptionExpiryReminders(app).catch(console.error);
}, 5000);

setInterval(() => {
  runSubscriptionExpiryReminders(app).catch(console.error);
}, 6 * 60 * 60 * 1000).unref();

let onlineAdmins = 0;
const onlineUsers = new Map();

app.set('getChatPresence', () => ({
  adminOnline: onlineAdmins > 0,
  onlineUserIds: [...onlineUsers.keys()],
}));

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.type !== 'access') {
      throw new Error('Invalid token');
    }

    const user = await AcademyUser.findOne({
      _id: payload.sub,
      isActive: true,
      isDeleted: false,
    });

    if (!user) {
      throw new Error('User not found');
    }

    socket.data.user = user;
    next();
  } catch (err) {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  const account = socket.data.user;

  if (account.role === 'admin') {
    socket.join('admins');
    socket.join(`admin:${account.id}`);

    onlineAdmins++;

    io.to('students').emit('presence:admin', {
      online: true,
    });
  } else {
    const userId = String(account.id);

    socket.join('students');
    socket.join(`user:${userId}`);

    onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);

    AcademyUser.updateOne(
      { _id: userId },
      { lastSeenAt: new Date() }
    ).catch(() => { });

    io.to('admins').emit('presence:user', {
      userId,
      online: true,
    });
  }

  socket.emit('presence:snapshot', {
    adminOnline: onlineAdmins > 0,
    onlineUserIds: [...onlineUsers.keys()],
  });

  socket.on('disconnect', () => {
    if (account.role === 'admin') {
      onlineAdmins = Math.max(0, onlineAdmins - 1);

      if (onlineAdmins === 0) {
        io.to('students').emit('presence:admin', {
          online: false,
        });
      }
    } else {
      const userId = String(account.id);

      const count = Math.max(
        0,
        (onlineUsers.get(userId) || 1) - 1
      );

      if (count === 0) {
        const lastSeenAt = new Date();

        onlineUsers.delete(userId);

        AcademyUser.updateOne(
          { _id: userId },
          { lastSeenAt }
        ).catch(() => { });

        io.to('admins').emit('presence:user', {
          userId,
          online: false,
          lastSeenAt: lastSeenAt.toISOString(),
        });
      } else {
        onlineUsers.set(userId, count);
      }
    }
  });

  socket.on('chat:send', async (payload, acknowledge) => {
    try {
      const text = payload?.text?.trim();
      const userId =
        account.role === 'admin'
          ? payload?.userId
          : account.id;

      if (!text || !userId) {
        throw new Error('Message is required');
      }

      const message = await ChatMessage.create({
        user: userId,
        sender: account.role,
        text,
      });

      io.to('admins')
        .to(`user:${userId}`)
        .emit('chat:message', message);

      if (account.role === 'admin') {
        await notifyUser(app, userId, {
          title: 'New message from academy',
          body: text,
          type: 'chat',
          data: {
            messageId: message.id,
          },
        });
      }

      acknowledge?.({
        success: true,
        data: message,
      });
    } catch (error) {
      acknowledge?.({
        success: false,
        message: error.message,
      });
    }
  });

  socket.on('chat:read', async (payload, acknowledge) => {
    try {
      const userId =
        account.role === 'admin'
          ? payload?.userId
          : account.id;

      if (!userId) {
        throw new Error('User is required');
      }

      const sender =
        account.role === 'admin'
          ? 'user'
          : 'admin';

      const readAt = new Date();

      await ChatMessage.updateMany(
        {
          user: userId,
          sender,
          readAt: null,
        },
        {
          readAt,
        }
      );

      const receipt = {
        userId: String(userId),
        reader: account.role,
        readAt: readAt.toISOString(),
      };

      io.to('admins')
        .to(`user:${userId}`)
        .emit('chat:read', receipt);

      acknowledge?.({
        success: true,
        data: receipt,
      });
    } catch (error) {
      acknowledge?.({
        success: false,
        message: error.message,
      });
    }
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(
      `VK English Academy API is already running on port ${port}.`
    );
    process.exit(0);
  }

  console.error('Unable to start API:', error);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});