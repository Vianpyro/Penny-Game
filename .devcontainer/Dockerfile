FROM alpine:latest

# Install common tools
RUN apk add --no-cache bash git \
    python3 py3-pip openssl

# Setup default user
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=${USER_UID}

RUN addgroup -g ${USER_GID} -S ${USERNAME} && \
    adduser -u ${USER_UID} -S -G ${USERNAME} -s /bin/bash ${USERNAME}

# Switch to the default user
USER ${USERNAME}

# Set environment variables for pip
ENV PATH="/home/${USERNAME}/.local/bin:$PATH" \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1
