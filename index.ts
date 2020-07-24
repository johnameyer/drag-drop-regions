const create = function<T extends keyof HTMLElementTagNameMap>(t: T): HTMLElementTagNameMap[T] { return document.createElement(t) };

const div = function(...contents: HTMLElement[]) {
    const div = create('div');
    div.append(...contents);
    return div;
}

const button = function(str: string, func: () => any) {
    const button = create('button');
    button.innerText = str;
    button.onclick = function(e) { e.preventDefault(); func(); }
    return button;
}

export const dragSegments = function<T, U extends HTMLElement>(containerProducer: () => HTMLDivElement, backing: T[][], transformer: (t: T) => U, submit?: (t: T[][]) => any, limits?: number[], validators?: ((items: T[]) => boolean)[], fixed?: boolean[][]) {   
    type DragElement = U & { 'data-id': [number, number] };

    const container = div();
    const refreshIds = () => {
        for(let i = 0; i < backing.length; i++) {
            for(let j = 0; j < backing[i].length; j++) {
                elements[i][j]['data-id'] = [i, j];
            }
        }
    }
    let selected: [number, number] | undefined = undefined;

    const elements: DragElement[][] = [];
    const internalContainers: HTMLDivElement[] = [];

    let placeHolderElement = div();

    const select = (element: DragElement) => {
        element.focus();
        selected = element['data-id'];
        element.classList.add('selected');
    }

    const unselect = (element: DragElement) => {
        selected = undefined;
        element.classList.remove('selected');
    }

    const insertPlaceholderFor = (element: DragElement) => {
        placeHolderElement.style.height = element.clientHeight + 'px';
        placeHolderElement.style.width = element.clientWidth + 'px';
        element.insertAdjacentElement('afterend', placeHolderElement);
    }

    const removePlaceholderFor = (element: DragElement) => {
        placeHolderElement.remove();
    }

    const preserveStyle = (element: DragElement) => {
        const oldData = (({position, top, left, zIndex}) => ({position, top, left, zIndex}))(element.style);
        resetPositioning = (element: DragElement) => {
            Object.assign(element.style, oldData);
        }
    }

    const positionElement = (element: DragElement, {pageX, pageY}: {pageX: number, pageY: number}) => {
        element.style.position = 'absolute';
        element.style.zIndex = '1000';
        element.style.left = (pageX - element.clientWidth/2) + 'px';
        element.style.top = (pageY - element.clientHeight/2) + 'px';
    }
    
    let resetPositioning: (element: DragElement) => any;

    const reorderElements = (oldContainerIndex: number, oldChildIndex: number, newContainerIndex: number, newChildIndex: number) => {
        if(oldContainerIndex !== newContainerIndex && limits && backing[newContainerIndex].length === limits[newContainerIndex]) {
            return;
        }

        if(fixed && fixed[oldContainerIndex][oldChildIndex]) {
            return;
        }
        
        const oldContainer = internalContainers[oldContainerIndex];
        const newContainer = internalContainers[newContainerIndex];
        
        const element = elements[oldContainerIndex][oldChildIndex];
        oldContainer.removeChild(element);
        const [item] = backing[oldContainerIndex].splice(oldChildIndex, 1);
        elements[oldContainerIndex].splice(oldChildIndex, 1);

        newContainer.insertBefore(element, elements[newContainerIndex][newChildIndex]);
        elements[newContainerIndex].splice(newChildIndex, 0, element);
        backing[newContainerIndex].splice(newChildIndex, 0, item);

        if(fixed) {
            fixed[oldContainerIndex].splice(oldChildIndex, 1);
            fixed[newContainerIndex].splice(newChildIndex, 0, false);
        }

        refreshIds();

        if(validators) {
            if(!validators[oldContainerIndex](backing[oldContainerIndex])) {
                internalContainers[oldContainerIndex].classList.add('invalid');
            } else {
                internalContainers[oldContainerIndex].classList.remove('invalid');
            }
            if(!validators[newContainerIndex](backing[newContainerIndex])) {
                internalContainers[newContainerIndex].classList.add('invalid');
            } else {
                internalContainers[newContainerIndex].classList.remove('invalid');
            }
        }
    }

    const handleDrop = (droppedOn: Element, pageX: number, pageY: number) => {
        if(!selected) return;
        let newContainer: HTMLDivElement | undefined = undefined;
        let newContainerIndex = 0
        for(; newContainerIndex < internalContainers.length; newContainerIndex++) {
            if(internalContainers[newContainerIndex].contains(droppedOn)) {
                newContainer = internalContainers[newContainerIndex];
                break;
            }
        }
        if(!newContainer) {
            return;
        }

        const [oldContainerIndex, oldChildIndex] = selected;
        const oldContainer = internalContainers[oldContainerIndex];

        let newChildIndex: number = elements[newContainerIndex].findIndex(child => child.contains(droppedOn));
        if(newChildIndex === -1) {
            // TODO rows vs columns and how to handle between rows
            for(let i = 0; i < elements[newContainerIndex].length; i++) {
                const element = elements[newContainerIndex][i];
                if(element.getBoundingClientRect().top <= pageY && pageY <= element.getBoundingClientRect().bottom){
                    if(pageX < element.getBoundingClientRect().left + element.clientWidth/2) {
                        newChildIndex = i;
                        break;
                    }
                }
            }
        }
        // TODO left vs right side using offsetX and offsetY for children
        if(newContainer === oldContainer) {
            if(newChildIndex == -1) {
                newChildIndex = backing[oldContainerIndex].length - 1;
            } else {
                const placedRightOf = pageX > elements[newContainerIndex][newChildIndex].getBoundingClientRect().left + elements[newContainerIndex][newChildIndex].clientWidth/2;
                if(placedRightOf) {
                    newChildIndex += 1;
                }
                if(newChildIndex > oldChildIndex) {
                    newChildIndex -= 1;
                }
            }
        } else {
            if(newChildIndex == -1) {
                newChildIndex = backing[newContainerIndex].length;
            } else if(pageX > elements[newContainerIndex][newChildIndex].getBoundingClientRect().left + elements[newContainerIndex][newChildIndex].clientWidth/2) {
                newChildIndex += 1;
            }
        }

        removePlaceholderFor(elements[oldContainerIndex][oldChildIndex]);

        reorderElements(oldContainerIndex, oldChildIndex, newContainerIndex, newChildIndex);
    };

    for(let i = 0; i < backing.length; i++) {
        const internalContainer = containerProducer();
        const elementArray = [];
        for(let j = 0; j < backing[i].length; j++) {
            const item = backing[i][j];
            const element = transformer(item) as DragElement;
            element['data-id'] = [i, j];
            if(fixed && fixed[i][j]) {
                element.classList.add('fixed');
                element.ondragstart = () => false;
            } else {
                element.draggable = true;
                element.ondragstart = (ev) => {
                    if(!ev.dataTransfer) return;
                    ev.dataTransfer.dropEffect = 'none';
                    selected = element['data-id'];
                }

                element.ontouchstart = (ev) => {
                    ev.preventDefault();
                    select(element);
                    preserveStyle(element);
                    element.ontouchend = (ev) => {
                        ev.preventDefault();
                        const touch = ev.changedTouches.item(0);
                        if(!touch) {
                            return;
                        }
                        resetPositioning(element);
                        removePlaceholderFor(element);
                        const { pageX, pageY, clientX, clientY } = touch;
                        const droppedOn = document.elementFromPoint(clientX, clientY);
                        if(droppedOn) {
                            handleDrop(droppedOn, pageX, pageY);
                        }
                        unselect(element);
                    }
                }

                element.ontouchmove = (ev) => {
                    ev.preventDefault();
                    insertPlaceholderFor(element);
                    positionElement(element, ev.changedTouches[0]);
                }

                element.ontouchcancel = (ev) => {
                    ev.preventDefault();
                    resetPositioning(element);
                    removePlaceholderFor(element);
                }
            }

            element.tabIndex = -1;
            element.onclick = () => {
                if(!fixed || !fixed[i][j]) {
                    select(element);
                    document.onclick = (ev) => {
                        if(!element.contains(ev.target as Element)) {
                            unselect(element);
                        }
                    }
                }
            }

            element.onkeyup = (ev) => {
                ev.preventDefault();
                const [oldContainerIndex, oldChildIndex] = element['data-id'];
                switch (ev.key) {
                    case 'ArrowLeft':
                    case 'a': {
                        const rowLength = elements[oldContainerIndex].length;
                        const newChildIndex = (oldChildIndex + rowLength - 1) % rowLength;
                        if(selected) {
                            reorderElements(oldContainerIndex, oldChildIndex, oldContainerIndex, newChildIndex);
                            select(element);
                        } else {
                            element.blur();
                            elements[oldContainerIndex][newChildIndex].focus();
                        }
                        break;
                    }
                    case 'ArrowRight':
                    case 'd': {
                        const rowLength = elements[oldContainerIndex].length;
                        const newChildIndex = (oldChildIndex + 1) % rowLength;
                        if(selected) {
                            reorderElements(oldContainerIndex, oldChildIndex, oldContainerIndex, newChildIndex);
                            select(element);
                        } else {
                            element.blur();
                            elements[oldContainerIndex][newChildIndex].focus();
                        }
                        break;
                    }
                    case 'ArrowUp':
                    case 'w': {
                        for(let relativeContainerIndex = 1; relativeContainerIndex < internalContainers.length; relativeContainerIndex++) {
                            const newContainerIndex = (oldContainerIndex + relativeContainerIndex) % internalContainers.length;
                            if(limits && limits[newContainerIndex] === backing[newContainerIndex].length) {
                                break;
                            }
                            const newChildIndex = Math.min(oldChildIndex, backing[newContainerIndex].length);
                            if(selected) {
                                reorderElements(oldContainerIndex, oldChildIndex, newContainerIndex, newChildIndex);
                                select(element);
                            } else {
                                element.blur();
                                elements[newContainerIndex][newChildIndex].focus();
                            }
                        }
                        break;
                    }
                    case 'ArrowDown':
                    case 's': {
                        for(let relativeContainerIndex = 1; relativeContainerIndex < internalContainers.length; relativeContainerIndex++) {
                            const newContainerIndex = (oldContainerIndex + internalContainers.length - relativeContainerIndex) % internalContainers.length;
                            if(limits && limits[newContainerIndex] === backing[newContainerIndex].length) {
                                break;
                            }
                            const newChildIndex = Math.min(oldChildIndex, backing[newContainerIndex].length);
                            if(selected) {
                                reorderElements(oldContainerIndex, oldChildIndex, newContainerIndex, newChildIndex);
                                select(element);
                            } else {
                                element.blur();
                                elements[newContainerIndex][newChildIndex].focus();
                            }
                        }
                        break;
                    }
                    
                    case 'Enter': {
                        if(!fixed || !fixed[i][j]) {
                            if(selected) {
                                unselect(element);
                            } else {
                                select(element);
                            }
                        }
                        break;
                    }
                }
            }
            internalContainer.append(element);
            elementArray.push(element);
        }
        internalContainer.ondrop = (ev) => {
            ev.preventDefault();
            if(!selected || !ev.dataTransfer) return;
            ev.dataTransfer.dropEffect = "move";
            if(!ev.target || !(ev.target instanceof Element)) return;
            handleDrop(ev.target, ev.pageX, ev.pageY);
            // unselect(ev.target);
        }
        internalContainer.ondragover =  (ev) => {
            ev.preventDefault();
            if(!ev.dataTransfer) return;
            if(!internalContainer.contains(ev.target as DragElement) && limits && backing[i].length === limits[i]) {
                ev.dataTransfer.dropEffect = "none";
            }
            if(!selected) return;
            const [oldContainerIndex, oldChildIndex] = selected;
            if(fixed && fixed[oldContainerIndex][oldChildIndex]) {
                ev.dataTransfer.dropEffect = "none";
            }
        }
        container.append(internalContainer);
        internalContainers.push(internalContainer);
        elements.push(elementArray);
    }
    setTimeout(() => {
        let row;
        if(row = elements.find(row => row.length)) {
            row[0].focus()
        }
    }, 0);
    if(submit) {
        container.append(button('Submit', () => submit(backing)));
    }
    return container;
}