import { Bot, InputFile } from 'grammy';
import path from 'path';
import fs from 'fs';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import { signalNewMessage } from '../message-signal.js';
import { transcribeBuffer, textToSpeech } from '../transcription.js';
import { markdownToTelegramHtml } from '../router.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';
import { registerCommands } from './telegram-commands.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  onSessionReset?: (chatJid: string) => boolean;
  onReset?: (chatJid: string) => Promise<string>;
  onGetStatus?: () => string;
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken);
    registerCommands(this.bot, this.opts);

    this.bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const chatJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        chatName,
        'telegram',
        isGroup,
      );

      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
      signalNewMessage();

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Telegram message stored',
      );
    });

    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
      signalNewMessage();
    };

    this.bot.on('message:photo', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];

      let placeholder = '[Photo]';
      try {
        const photos = ctx.message.photo;
        const largestPhoto = photos[photos.length - 1];
        const file = await ctx.api.getFile(largestPhoto.file_id);
        const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;

        const mediaDir = path.join(process.cwd(), 'data', 'telegram-media');
        await fs.promises.mkdir(mediaDir, { recursive: true });

        const resp = await fetch(url);
        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          const timestamp = Date.now();
          const filename = `photo_${chatJid.replace(':', '_')}_${timestamp}.jpg`;
          const filepath = path.join(mediaDir, filename);
          await fs.promises.writeFile(filepath, buffer);

          placeholder = `[Photo: ${filepath}]`;
          logger.info(
            { chatJid, filepath, bytes: buffer.length },
            'Downloaded Telegram photo',
          );

          if (chatJid === 'tg:414798121') {
            const desktopPath = path.join(
              process.env.HOME || '',
              'Desktop',
              'latest-telegram-photo.jpg',
            );
            await fs.promises.writeFile(desktopPath, buffer);
            logger.info({ desktopPath }, 'Saved photo to Desktop');
          }
        }
      } catch (err) {
        logger.error({ err }, 'Telegram photo download error');
      }

      storeNonText(ctx, placeholder);
    });
    this.bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
    this.bot.on('message:voice', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      let placeholder = '[Voice Message - transcription unavailable]';
      try {
        const file = await ctx.getFile();
        const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          logger.info(
            { chatJid, bytes: buffer.length },
            'Downloaded Telegram voice',
          );
          const transcript = await transcribeBuffer(buffer);
          if (transcript) {
            placeholder = `[Voice: ${transcript.trim()}]`;
            logger.info(
              { chatJid, length: transcript.length },
              'Transcribed Telegram voice',
            );
          }
        }
      } catch (err) {
        logger.error({ err }, 'Telegram voice transcription error');
        placeholder = '[Voice Message - transcription failed]';
      }
      storeNonText(ctx, placeholder);
    });
    this.bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
    this.bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Register commands in Telegram's menu (shows when user types /)
    await this.bot.api
      .setMyCommands([
        { command: 'ping', description: 'Check the bot is online' },
        {
          command: 'status',
          description: 'Active agents, queue depth, uptime',
        },
        { command: 'skills', description: 'List installed skills' },
        {
          command: 'reset',
          description: 'Kill agents, wipe sessions, restart fresh',
        },
        { command: 'model', description: 'View or switch AI model' },
        { command: 'update', description: 'Pull latest code and restart' },
        { command: 'chatid', description: "Get this chat's registration ID" },
      ])
      .catch((err) => logger.warn({ err }, 'setMyCommands failed (non-fatal)'));

    return new Promise<void>((resolve) => {
      this.bot!.start({
        onStart: (botInfo) => {
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          resolve();
        },
      });
    });
  }

  async sendMessage(
    jid: string,
    text: string,
    voiceReply?: boolean,
  ): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');

      if (voiceReply) {
        logger.info({ jid }, 'Attempting voice reply via TTS');
        const audioBuffer = await textToSpeech(text);
        if (audioBuffer) {
          await this.bot.api.sendVoice(
            numericId,
            new InputFile(audioBuffer, 'voice.mp3'),
          );
          logger.info(
            { jid, length: text.length },
            'Telegram voice message sent',
          );
          return;
        }
      }

      const html = markdownToTelegramHtml(text);

      const MAX_LENGTH = 4096;
      if (html.length <= MAX_LENGTH) {
        await this.bot.api.sendMessage(numericId, html, {
          parse_mode: 'HTML',
        });
      } else {
        const chunks: string[] = [];
        let current = '';
        const TELEGRAM_TAGS = ['pre', 'code', 'b', 'i', 'u', 's', 'a'];

        for (const line of html.split('\n')) {
          if (current.length + line.length + 1 > MAX_LENGTH) {
            if (current) chunks.push(current);
            current = line;
          } else {
            current = current ? `${current}\n${line}` : line;
          }
        }
        if (current) chunks.push(current);

        const fixedChunks: string[] = [];
        let carryTags: string[] = [];
        for (const chunk of chunks) {
          let fixed = carryTags.map((t) => `<${t}>`).join('') + chunk;

          const openTags: string[] = [];
          for (const tag of TELEGRAM_TAGS) {
            const opens = (
              fixed.match(new RegExp(`<${tag}(\\s|>)`, 'gi')) || []
            ).length;
            const closes = (fixed.match(new RegExp(`</${tag}>`, 'gi')) || [])
              .length;
            for (let i = 0; i < opens - closes; i++) {
              openTags.push(tag);
            }
          }

          carryTags = [...openTags];
          for (const tag of [...openTags].reverse()) {
            fixed += `</${tag}>`;
          }

          fixedChunks.push(fixed);
        }

        for (const chunk of fixedChunks) {
          await this.bot.api.sendMessage(numericId, chunk, {
            parse_mode: 'HTML',
          });
        }
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  async sendDocument(
    jid: string,
    buffer: Buffer,
    filename: string,
  ): Promise<void> {
    if (!this.bot) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendDocument(
        numericId,
        new InputFile(buffer, filename),
      );
      logger.info({ jid, filename }, 'Telegram document sent');
    } catch (err) {
      logger.error({ jid, filename, err }, 'Failed to send Telegram document');
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}
