{D67F6D92-C3B5-4ABA-BD8B-8F5FDBA159FD}.png# Проверка сетевой конфигурации Oracle Cloud

## Проблема: HTTP 503 извне, но локально работает

Если сервер работает локально, но возвращает 503 извне, проблема в сетевой конфигурации Oracle Cloud.

## Проверка 1: Route Table

1. **Networking** → **Virtual Cloud Networks** → ваша VCN
2. **Route Tables** → выберите Route Table вашей подсети
3. Проверьте **Route Rules**:
   - Должно быть правило:
     - **Target Type**: Internet Gateway
     - **Destination CIDR Block**: `0.0.0.0/0`
     - **Target**: ваш Internet Gateway

Если правила нет - добавьте!

## Проверка 2: Internet Gateway

1. В VCN перейдите в **Internet Gateways**
2. Убедитесь, что Internet Gateway:
   - **State**: **Attached** (прикреплен)
   - Прикреплен к вашей VCN

Если не прикреплен - прикрепите!

## Проверка 3: Подсеть (Subnet)

1. **Networking** → **Virtual Cloud Networks** → ваша VCN
2. **Subnets** → выберите подсеть вашего instance
3. Проверьте:
   - **Subnet Type**: должна быть **Regional** (Public Subnet)
   - **Route Table**: должна быть привязана к Route Table с Internet Gateway
   - **Security List**: должна включать ваш Security List с правилом для порта 3000

## Проверка 4: Instance Network

1. **Compute** → **Instances** → ваш instance
2. В разделе **Primary VNIC** проверьте:
   - **Subnet**: должна быть Public Subnet
   - **Public IP**: должен быть назначен публичный IP
   - **Private IP**: должен быть внутренний IP (например, 10.0.0.x)

## Проверка 5: Network Security Groups (если используются)

1. **Networking** → **Network Security Groups**
2. Если есть NSG, привязанные к instance:
   - Проверьте Ingress Rules
   - Добавьте правило для порта 3000, если его нет

## Быстрое решение:

Если Route Table не настроен правильно:

1. **Networking** → **Virtual Cloud Networks** → ваша VCN
2. **Route Tables** → выберите Route Table подсети
3. **Add Route Rules**:
   - **Target Type**: Internet Gateway
   - **Destination CIDR Block**: `0.0.0.0/0`
   - **Target Internet Gateway**: выберите ваш Internet Gateway
4. Сохраните

После этого подождите 1-2 минуты и попробуйте снова.

